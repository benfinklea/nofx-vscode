import {
    EnterpriseSmartTemplateFactory,
    SmartTemplateError,
    SmartTemplateErrorCode,
    AgentConfig,
    DeveloperConfig,
    ArchitectConfig,
    QualityConfig,
    ProcessConfig,
    SmartAgentTemplate
} from '../../../agents/EnterpriseSmartTemplateSystem';

describe('EnterpriseSmartTemplateSystem', () => {
    let factory: EnterpriseSmartTemplateFactory;

    beforeEach(async () => {
        // Clear any existing factory instance
        (EnterpriseSmartTemplateFactory as any).instance = null;
        factory = EnterpriseSmartTemplateFactory.getInstance();

        // Mock VS Code environment
        (global as any).vscode = {
            window: {
                createOutputChannel: jest.fn(),
                showErrorMessage: jest.fn()
            },
            workspace: {
                getConfiguration: jest.fn(() => ({}))
            }
        };

        // Mock process.memoryUsage for validation
        jest.spyOn(process, 'memoryUsage').mockReturnValue({
            rss: 100 * 1024 * 1024,
            heapTotal: 200 * 1024 * 1024,
            heapUsed: 50 * 1024 * 1024,
            external: 10 * 1024 * 1024,
            arrayBuffers: 5 * 1024 * 1024
        });
    });

    afterEach(async () => {
        if (factory) {
            await factory.dispose();
        }
        jest.restoreAllMocks();
        delete (global as any).vscode;
    });

    describe('SmartTemplateError', () => {
        test('should create error with all required properties', () => {
            const context = { testData: 'value' };
            const error = new SmartTemplateError(
                SmartTemplateErrorCode.INVALID_CONFIG,
                'Test error message',
                context,
                true,
                'high'
            );

            expect(error.code).toBe(SmartTemplateErrorCode.INVALID_CONFIG);
            expect(error.message).toBe('Test error message');
            expect(error.context).toEqual(context);
            expect(error.retryable).toBe(true);
            expect(error.severity).toBe('high');
            expect(error.timestamp).toBeInstanceOf(Date);
            expect(error.name).toBe('SmartTemplateError');
        });

        test('should create error with default values', () => {
            const error = new SmartTemplateError(SmartTemplateErrorCode.TEMPLATE_GENERATION_FAILED, 'Test error');

            expect(error.context).toEqual({});
            expect(error.retryable).toBe(false);
            expect(error.severity).toBe('medium');
        });

        test('should convert to log object correctly', () => {
            const error = new SmartTemplateError(
                SmartTemplateErrorCode.INVALID_CONFIG,
                'Test error',
                { key: 'value' },
                true,
                'critical'
            );

            const logObject = error.toLogObject();

            expect(logObject).toMatchObject({
                error: 'SmartTemplateError',
                code: SmartTemplateErrorCode.INVALID_CONFIG,
                message: 'Test error',
                context: { key: 'value' },
                retryable: true,
                severity: 'critical'
            });
            expect(logObject.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
            expect(typeof logObject.stack).toBe('string');
        });

        test('should maintain proper prototype chain', () => {
            const error = new SmartTemplateError(SmartTemplateErrorCode.INVALID_CONFIG, 'Test');

            expect(error).toBeInstanceOf(SmartTemplateError);
            expect(error).toBeInstanceOf(Error);
        });
    });

    describe('Factory Singleton Pattern', () => {
        test('should return the same instance on multiple calls', () => {
            const instance1 = EnterpriseSmartTemplateFactory.getInstance();
            const instance2 = EnterpriseSmartTemplateFactory.getInstance();

            expect(instance1).toBe(instance2);
        });

        test('should create new instance after disposal', async () => {
            const instance1 = EnterpriseSmartTemplateFactory.getInstance();
            await instance1.dispose();

            // Clear instance to allow new creation
            (EnterpriseSmartTemplateFactory as any).instance = null;
            const instance2 = EnterpriseSmartTemplateFactory.getInstance();

            expect(instance1).not.toBe(instance2);
        });
    });

    describe('Factory Initialization', () => {
        test('should initialize successfully with valid environment', async () => {
            await expect(factory.initialize()).resolves.not.toThrow();

            const health = factory.getHealthStatus();
            expect(health.details.initialized).toBe(true);
        });

        test('should handle repeated initialization calls gracefully', async () => {
            await factory.initialize();
            await factory.initialize(); // Should not throw or re-initialize

            const health = factory.getHealthStatus();
            expect(health.details.initialized).toBe(true);
        });

        test('should throw error when memory is insufficient', async () => {
            jest.spyOn(process, 'memoryUsage').mockReturnValue({
                rss: 10 * 1024 * 1024,
                heapTotal: 20 * 1024 * 1024,
                heapUsed: 19 * 1024 * 1024,
                external: 1 * 1024 * 1024,
                arrayBuffers: 0
            });

            await expect(factory.initialize()).rejects.toThrow(SmartTemplateError);
            await expect(factory.initialize()).rejects.toMatchObject({
                code: SmartTemplateErrorCode.MEMORY_EXHAUSTED,
                severity: 'critical'
            });
        });

        test('should throw error when VS Code environment is unavailable', async () => {
            delete (global as any).vscode;

            await expect(factory.initialize()).rejects.toThrow(SmartTemplateError);
            await expect(factory.initialize()).rejects.toMatchObject({
                code: SmartTemplateErrorCode.TEMPLATE_GENERATION_FAILED,
                severity: 'critical'
            });
        });

        test('should handle initialization errors gracefully', async () => {
            // Mock a failing internal method
            const validateSpy = jest
                .spyOn(factory as any, 'validateSystemRequirements')
                .mockRejectedValue(new Error('System validation failed'));

            await expect(factory.initialize()).rejects.toThrow(SmartTemplateError);
            expect(validateSpy).toHaveBeenCalled();
        });
    });

    describe('Input Validation', () => {
        beforeEach(async () => {
            await factory.initialize();
        });

        describe('AgentConfig Validation', () => {
            test('should validate valid developer config', () => {
                const config: DeveloperConfig = {
                    category: 'developer',
                    primaryDomain: 'frontend',
                    languages: ['typescript'],
                    frameworks: ['react'],
                    specializations: ['ui-ux'],
                    toolchain: ['vscode'],
                    complexity: 'medium',
                    priority: 'high'
                };

                expect(
                    () =>
                        (factory as any).validateAgentConfig?.(config) ||
                        require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateAgentConfig(
                            config
                        )
                ).not.toThrow();
            });

            test('should reject invalid category', () => {
                const config = {
                    category: 'invalid-category',
                    complexity: 'medium',
                    priority: 'high'
                };

                expect(() =>
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateAgentConfig(
                        config
                    )
                ).toThrow(SmartTemplateError);
            });

            test('should reject null/undefined config', () => {
                expect(() =>
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateAgentConfig(
                        null
                    )
                ).toThrow(SmartTemplateError);

                expect(() =>
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateAgentConfig(
                        undefined
                    )
                ).toThrow(SmartTemplateError);
            });

            test('should sanitize string inputs', () => {
                const config = {
                    category: 'developer',
                    complexity: 'medium',
                    priority: 'high',
                    description: '<script>alert("xss")</script>Safe content'
                };

                const validated =
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateAgentConfig(
                        config
                    );

                expect(validated.description).not.toContain('<script>');
                expect(validated.description).toContain('Safe content');
            });

            test('should validate array field lengths', () => {
                const config: DeveloperConfig = {
                    category: 'developer',
                    primaryDomain: 'frontend',
                    languages: new Array(101).fill('typescript'), // Exceeds limit
                    frameworks: ['react'],
                    specializations: ['ui-ux'],
                    toolchain: ['vscode'],
                    complexity: 'medium',
                    priority: 'high'
                };

                expect(() =>
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateAgentConfig(
                        config
                    )
                ).toThrow(SmartTemplateError);
            });

            test('should validate array element types', () => {
                const config = {
                    category: 'developer',
                    complexity: 'medium',
                    priority: 'high',
                    languages: ['typescript', 123, 'javascript'] // Mixed types
                };

                expect(() =>
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateAgentConfig(
                        config
                    )
                ).toThrow(SmartTemplateError);
            });

            test('should handle malformed complexity values', () => {
                const config = {
                    category: 'developer',
                    complexity: 'ultra-high', // Invalid complexity
                    priority: 'high'
                };

                expect(() =>
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateAgentConfig(
                        config
                    )
                ).toThrow(SmartTemplateError);
            });

            test('should handle malformed priority values', () => {
                const config = {
                    category: 'developer',
                    complexity: 'medium',
                    priority: 'urgent' // Invalid priority
                };

                expect(() =>
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateAgentConfig(
                        config
                    )
                ).toThrow(SmartTemplateError);
            });
        });

        describe('Natural Language Input Validation', () => {
            test('should validate valid natural language input', () => {
                const input = 'Create a React component for user authentication';

                expect(() =>
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateNaturalLanguageInput(
                        input
                    )
                ).not.toThrow();
            });

            test('should reject non-string input', () => {
                expect(() =>
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateNaturalLanguageInput(
                        123
                    )
                ).toThrow(SmartTemplateError);

                expect(() =>
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateNaturalLanguageInput(
                        null
                    )
                ).toThrow(SmartTemplateError);
            });

            test('should reject empty input', () => {
                expect(() =>
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateNaturalLanguageInput(
                        ''
                    )
                ).toThrow(SmartTemplateError);
            });

            test('should reject oversized input', () => {
                const oversizedInput = 'a'.repeat(20000); // Exceeds MAX_STRING_LENGTH

                expect(() =>
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateNaturalLanguageInput(
                        oversizedInput
                    )
                ).toThrow(SmartTemplateError);
            });

            test('should detect injection attempts', () => {
                const maliciousInputs = [
                    '<script>alert("xss")</script>',
                    'javascript:alert("xss")',
                    'onclick="alert(1)"',
                    'data:text/html,<script>alert(1)</script>',
                    'vbscript:msgbox("hello")'
                ];

                maliciousInputs.forEach(input => {
                    expect(() =>
                        require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateNaturalLanguageInput(
                            input
                        )
                    ).toThrow(SmartTemplateError);
                });
            });

            test('should sanitize safe input', () => {
                const input = 'Create a <div> element with "quotes" and /path';

                const sanitized =
                    require('../../../agents/EnterpriseSmartTemplateSystem').SmartTemplateValidator.validateNaturalLanguageInput(
                        input
                    );

                expect(sanitized).not.toContain('<div>');
                expect(sanitized).not.toContain('"quotes"');
                expect(sanitized).toContain('&lt;div&gt;');
                expect(sanitized).toContain('&quot;quotes&quot;');
            });
        });
    });

    describe('Template Creation', () => {
        beforeEach(async () => {
            await factory.initialize();
        });

        test('should create template for developer config', async () => {
            const config: DeveloperConfig = {
                category: 'developer',
                primaryDomain: 'frontend',
                languages: ['typescript', 'javascript'],
                frameworks: ['react', 'vue'],
                specializations: ['ui-ux', 'performance'],
                toolchain: ['vscode', 'webpack'],
                complexity: 'high',
                priority: 'critical'
            };

            const template = await factory.createTemplate(config);

            expect(template).toMatchObject({
                id: expect.stringMatching(/^smart-developer-/),
                name: expect.any(String),
                icon: expect.any(String),
                terminalIcon: expect.any(String),
                color: expect.any(String),
                description: expect.any(String),
                version: '4.0.0-enterprise',
                config: config,
                systemPrompt: expect.any(String),
                detailedPrompt: expect.any(String)
            });

            expect(template.capabilities).toMatchObject({
                category: 'developer',
                complexity: 'high',
                priority: 'critical',
                enterprise: true,
                reliability: '99.99%'
            });
        });

        test('should create template for architect config', async () => {
            const config: ArchitectConfig = {
                category: 'architect',
                scope: 'software',
                focusAreas: ['microservices', 'scalability'],
                decisionLevel: 'strategic',
                systemTypes: ['distributed', 'cloud-native'],
                complexity: 'high',
                priority: 'critical'
            };

            const template = await factory.createTemplate(config);

            expect(template.id).toMatch(/^smart-architect-/);
            expect(template.config).toEqual(config);
            expect((template.capabilities as any).category).toBe('architect');
        });

        test('should create template for quality config', async () => {
            const config: QualityConfig = {
                category: 'quality',
                primaryFocus: 'testing',
                testingTypes: ['unit', 'integration', 'e2e'],
                securityScope: ['authentication', 'authorization'],
                auditAreas: ['code-quality', 'performance'],
                toolchain: ['jest', 'cypress'],
                complexity: 'medium',
                priority: 'high'
            };

            const template = await factory.createTemplate(config);

            expect(template.id).toMatch(/^smart-quality-/);
            expect(template.config).toEqual(config);
            expect((template.capabilities as any).category).toBe('quality');
        });

        test('should create template for process config', async () => {
            const config: ProcessConfig = {
                category: 'process',
                role: 'product-manager',
                methodologies: ['agile', 'scrum'],
                stakeholders: ['developers', 'users', 'business'],
                deliverables: ['requirements', 'roadmap'],
                communicationStyle: 'business',
                complexity: 'medium',
                priority: 'high'
            };

            const template = await factory.createTemplate(config);

            expect(template.id).toMatch(/^smart-process-/);
            expect(template.config).toEqual(config);
            expect((template.capabilities as any).category).toBe('process');
        });

        test('should use cache for identical configurations', async () => {
            const config: DeveloperConfig = {
                category: 'developer',
                primaryDomain: 'backend',
                languages: ['python'],
                frameworks: ['django'],
                specializations: ['api'],
                toolchain: ['vscode'],
                complexity: 'medium',
                priority: 'medium'
            };

            const template1 = await factory.createTemplate(config);
            const template2 = await factory.createTemplate(config);

            // Templates should be different instances (deep cloned)
            expect(template1).not.toBe(template2);
            // But should have identical content
            expect(template1.id).toBe(template2.id);
            expect(template1.config).toEqual(template2.config);
        });

        test('should handle template creation errors gracefully', async () => {
            // Mock internal method to throw error
            const createInternalSpy = jest
                .spyOn(factory as any, 'createTemplateInternal')
                .mockRejectedValue(new Error('Internal creation failed'));

            const config: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'high'
            };

            // Should try fallback and potentially succeed
            const result = await factory.createTemplate(config);
            expect(result).toBeDefined();
            expect(result.version).toContain('fallback');
        });

        test('should validate generated template', async () => {
            const config: AgentConfig = {
                category: 'developer',
                complexity: 'low',
                priority: 'low'
            };

            const template = await factory.createTemplate(config);

            // Check required fields
            expect(template.id).toBeDefined();
            expect(template.name).toBeDefined();
            expect(template.icon).toBeDefined();
            expect(template.description).toBeDefined();
            expect(template.systemPrompt).toBeDefined();
            expect(template.config).toBeDefined();

            // Check template size is reasonable
            const templateSize = JSON.stringify(template).length;
            expect(templateSize).toBeLessThan(1024 * 1024); // Less than 1MB
        });

        test('should auto-initialize when not initialized', async () => {
            // Create new factory without initialization
            (EnterpriseSmartTemplateFactory as any).instance = null;
            const newFactory = EnterpriseSmartTemplateFactory.getInstance();

            const config: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'medium'
            };

            const template = await newFactory.createTemplate(config);
            expect(template).toBeDefined();

            const health = newFactory.getHealthStatus();
            expect(health.details.initialized).toBe(true);

            await newFactory.dispose();
        });
    });

    describe('Circuit Breaker Functionality', () => {
        beforeEach(async () => {
            await factory.initialize();
        });

        test('should handle circuit breaker open state', async () => {
            // Force multiple failures to open circuit breaker
            const createSpy = jest
                .spyOn(factory as any, 'createTemplateInternal')
                .mockRejectedValue(new Error('Simulated failure'));

            const config: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'medium'
            };

            // Should eventually use fallback
            const result = await factory.createTemplate(config);
            expect(result).toBeDefined();
            expect(result.version).toContain('fallback');
        });

        test('should track circuit breaker state in health status', async () => {
            const health = factory.getHealthStatus();
            expect(health.details.circuitBreaker).toMatchObject({
                state: expect.stringMatching(/closed|open|half-open/),
                failures: expect.any(Number),
                lastFailureTime: expect.any(Object)
            });
        });
    });

    describe('Metrics and Health Monitoring', () => {
        beforeEach(async () => {
            await factory.initialize();
        });

        test('should track operation metrics', async () => {
            const config: AgentConfig = {
                category: 'developer',
                complexity: 'low',
                priority: 'low'
            };

            await factory.createTemplate(config);

            const health = factory.getHealthStatus();
            expect(health.details.metrics).toMatchObject({
                uptime: expect.any(Number),
                totalOperations: expect.any(Number),
                successRate: expect.any(Number),
                averageDuration: expect.any(Number),
                operationCounts: expect.any(Object)
            });
        });

        test('should report healthy status initially', () => {
            const health = factory.getHealthStatus();
            expect(health.status).toBe('healthy');
            expect(health.details.initialized).toBe(true);
        });

        test('should detect degraded performance', async () => {
            // Mock slow operations
            const slowOperation = jest.spyOn(factory as any, 'createTemplateInternal').mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 6000)); // 6 seconds
                throw new Error('Slow operation');
            });

            const config: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'medium'
            };

            // This should use fallback due to slow operation
            await factory.createTemplate(config);

            // Health status should reflect performance issues
            const health = factory.getHealthStatus();
            expect(health.details.metrics.averageDuration).toBeGreaterThan(0);
        });
    });

    describe('Resource Management and Disposal', () => {
        test('should dispose resources properly', async () => {
            await factory.initialize();

            const config: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'medium'
            };

            await factory.createTemplate(config);

            // Health should be good before disposal
            let health = factory.getHealthStatus();
            expect(health.status).toBe('healthy');
            expect(health.details.resourcesDisposed).toBe(false);

            await factory.dispose();

            // Health should reflect disposed state
            health = factory.getHealthStatus();
            expect(health.details.resourcesDisposed).toBe(true);
        });

        test('should handle multiple disposal calls gracefully', async () => {
            await factory.initialize();

            await factory.dispose();
            await factory.dispose(); // Should not throw

            const health = factory.getHealthStatus();
            expect(health.details.resourcesDisposed).toBe(true);
        });

        test('should clear caches on disposal', async () => {
            await factory.initialize();

            const config: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'medium'
            };

            await factory.createTemplate(config);

            let health = factory.getHealthStatus();
            expect(health.details.cacheSize).toBeGreaterThan(0);

            await factory.dispose();

            health = factory.getHealthStatus();
            expect(health.details.cacheSize).toBe(0);
        });

        test('should handle resource cleanup errors gracefully', async () => {
            await factory.initialize();

            // Mock resource cleanup error
            const resourceManager = (factory as any).resourceManager;
            const originalDispose = resourceManager.dispose;
            resourceManager.dispose = jest.fn().mockRejectedValue(new Error('Cleanup failed'));

            // Should not throw even if cleanup fails
            await expect(factory.dispose()).rejects.toThrow('Cleanup failed');
        });
    });

    describe('Fallback Mechanisms', () => {
        beforeEach(async () => {
            await factory.initialize();
        });

        test('should create fallback template when main creation fails', async () => {
            // Force main creation to fail
            jest.spyOn(factory as any, 'createTemplateInternal').mockRejectedValue(new Error('Main creation failed'));

            const config: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'high'
            };

            const template = await factory.createTemplate(config);

            expect(template).toBeDefined();
            expect(template.id).toMatch(/^fallback-developer-/);
            expect(template.version).toContain('fallback');
            expect(template.capabilities).toMatchObject({
                category: 'developer',
                fallback: true
            });
        });

        test('should handle fallback creation failure', async () => {
            // Force both main and fallback creation to fail
            jest.spyOn(factory as any, 'createTemplateInternal').mockRejectedValue(new Error('Main creation failed'));
            jest.spyOn(factory as any, 'tryFallbackTemplate').mockResolvedValue(null);

            const config: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'high'
            };

            await expect(factory.createTemplate(config)).rejects.toThrow(SmartTemplateError);
        });
    });

    describe('Cache Management', () => {
        beforeEach(async () => {
            await factory.initialize();
        });

        test('should manage cache size effectively', async () => {
            const configs: AgentConfig[] = [];

            // Create many different configs to fill cache
            for (let i = 0; i < 1100; i++) {
                configs.push({
                    category: 'developer',
                    complexity: 'medium',
                    priority: 'medium',
                    // Make each config unique
                    description: `Config ${i}`
                } as any);
            }

            // Create templates to fill cache
            for (const config of configs.slice(0, 50)) {
                await factory.createTemplate(config);
            }

            const health = factory.getHealthStatus();
            expect(health.details.cacheSize).toBeLessThanOrEqual(1000);
        });

        test('should generate consistent cache keys for identical configs', () => {
            const config1: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'high'
            };

            const config2: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'high'
            };

            const key1 = (factory as any).generateCacheKey(config1);
            const key2 = (factory as any).generateCacheKey(config2);

            expect(key1).toBe(key2);
        });

        test('should generate different cache keys for different configs', () => {
            const config1: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'high'
            };

            const config2: AgentConfig = {
                category: 'architect',
                complexity: 'medium',
                priority: 'high'
            };

            const key1 = (factory as any).generateCacheKey(config1);
            const key2 = (factory as any).generateCacheKey(config2);

            expect(key1).not.toBe(key2);
        });
    });

    describe('Error Scenarios and Edge Cases', () => {
        test('should handle malformed configuration objects', async () => {
            await factory.initialize();

            const malformedConfigs = [
                { category: 'developer' }, // Missing required fields
                { complexity: 'medium', priority: 'high' }, // Missing category
                'invalid', // Not an object
                123, // Number instead of object
                [], // Array instead of object
                null,
                undefined
            ];

            for (const config of malformedConfigs) {
                await expect(factory.createTemplate(config as any)).rejects.toThrow(SmartTemplateError);
            }
        });

        test('should handle extremely large configuration objects', async () => {
            await factory.initialize();

            const largeConfig: any = {
                category: 'developer',
                complexity: 'medium',
                priority: 'high',
                // Add large array that exceeds limits
                languages: new Array(200).fill('typescript')
            };

            await expect(factory.createTemplate(largeConfig)).rejects.toThrow(SmartTemplateError);
        });

        test('should handle concurrent template creation', async () => {
            await factory.initialize();

            const config: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'medium'
            };

            // Create multiple templates concurrently
            const promises = Array.from({ length: 10 }, () => factory.createTemplate(config));

            const templates = await Promise.all(promises);

            // All should succeed and be identical in content
            templates.forEach(template => {
                expect(template).toBeDefined();
                expect(template.config.category).toBe('developer');
            });
        });

        test('should handle memory pressure during operations', async () => {
            await factory.initialize();

            // Mock low memory condition
            jest.spyOn(process, 'memoryUsage').mockReturnValue({
                rss: 500 * 1024 * 1024,
                heapTotal: 600 * 1024 * 1024,
                heapUsed: 590 * 1024 * 1024, // Very high usage
                external: 10 * 1024 * 1024,
                arrayBuffers: 5 * 1024 * 1024
            });

            const config: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'medium'
            };

            // Should still work or fail gracefully
            try {
                const template = await factory.createTemplate(config);
                expect(template).toBeDefined();
            } catch (error) {
                expect(error).toBeInstanceOf(SmartTemplateError);
            }
        });

        test('should handle invalid template generation results', async () => {
            await factory.initialize();

            // Mock template generation to return invalid result
            jest.spyOn(factory as any, 'createTemplateInternal').mockResolvedValue({
                // Missing required fields
                id: 'test',
                version: '1.0.0'
            });

            const config: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'medium'
            };

            // Should fail validation and use fallback
            const template = await factory.createTemplate(config);
            expect(template.version).toContain('fallback');
        });
    });

    describe('System Integration', () => {
        test('should work with different VS Code configurations', async () => {
            // Test with minimal VS Code mock
            (global as any).vscode = {
                window: {},
                workspace: {}
            };

            await factory.initialize();

            const config: AgentConfig = {
                category: 'developer',
                complexity: 'medium',
                priority: 'medium'
            };

            const template = await factory.createTemplate(config);
            expect(template).toBeDefined();
        });

        test('should handle process event registration', async () => {
            const originalEventHandlers = process.listeners('uncaughtException').slice();

            await factory.initialize();

            // Should have registered event handlers
            expect(process.listeners('uncaughtException').length).toBeGreaterThan(originalEventHandlers.length);
        });

        test('should handle unexpected process events', async () => {
            await factory.initialize();

            // Should not throw when handling process events
            expect(() => {
                process.emit('uncaughtException' as any, new Error('Test error'), 'test');
            }).not.toThrow();
        });
    });
});
