/**
 * Contract tests for SmartTemplateSystem
 * Ensures that the template generation system meets its contract requirements
 */

import * as assert from 'assert';
import { 
    DeveloperSmartTemplate, 
    DeveloperConfig,
    SmartAgentTemplate,
    ArchitectSmartTemplate,
    ArchitectConfig,
    QualitySmartTemplate,
    QualityConfig
} from '../../agents/SmartTemplateSystem';

describe('SmartTemplateSystem Contract Tests', () => {
    
    describe('DeveloperSmartTemplate Contract', () => {
        const validConfigs: DeveloperConfig[] = [
            {
                category: 'developer',
                complexity: 'high',
                priority: 'high',
                primaryDomain: 'frontend',
                languages: ['typescript', 'javascript'],
                frameworks: ['react'],
                specializations: ['ui'],
                toolchain: ['webpack']
            },
            {
                category: 'developer',
                complexity: 'medium',
                priority: 'medium',
                primaryDomain: 'backend',
                languages: ['python'],
                frameworks: ['django'],
                specializations: ['api'],
                toolchain: ['docker']
            },
            {
                category: 'developer',
                complexity: 'low',
                priority: 'low',
                primaryDomain: 'mobile',
                languages: ['swift'],
                frameworks: ['swiftui'],
                specializations: ['ios'],
                toolchain: ['xcode']
            }
        ];

        validConfigs.forEach((config, index) => {
            describe(`Configuration ${index + 1}: ${config.primaryDomain}`, () => {
                let template: DeveloperSmartTemplate;
                let generated: SmartAgentTemplate;

                beforeEach(() => {
                    template = new DeveloperSmartTemplate(config);
                    generated = template.generateTemplate();
                });

                it('should fulfill the SmartAgentTemplate interface contract', () => {
                    // Required properties
                    assert.ok(generated.id, 'Must have id');
                    assert.ok(generated.name, 'Must have name');
                    assert.ok(generated.icon, 'Must have icon');
                    assert.ok(generated.terminalIcon, 'Must have terminalIcon');
                    assert.ok(generated.color, 'Must have color');
                    assert.ok(generated.description, 'Must have description');
                    assert.ok(generated.version, 'Must have version');
                    assert.ok(generated.systemPrompt, 'Must have systemPrompt');
                    assert.ok(generated.capabilities, 'Must have capabilities');
                    assert.ok(generated.taskPreferences, 'Must have taskPreferences');
                    
                    // Type checking
                    assert.strictEqual(typeof generated.id, 'string');
                    assert.strictEqual(typeof generated.name, 'string');
                    assert.strictEqual(typeof generated.icon, 'string');
                    assert.strictEqual(typeof generated.systemPrompt, 'string');
                    assert.strictEqual(typeof generated.capabilities, 'object');
                });

                it('should generate systemPrompt within size constraints', () => {
                    const promptLength = generated.systemPrompt.length;
                    assert.ok(promptLength > 3000, 
                        `Prompt should be comprehensive (>3000 chars), got ${promptLength}`);
                    assert.ok(promptLength < 4096, 
                        `Prompt should fit CLI limit (<4096 chars), got ${promptLength}`);
                });

                it('should include all required prompt sections', () => {
                    const prompt = generated.systemPrompt;
                    
                    // Contract: Must include these sections
                    assert.ok(prompt.includes('## Core Expertise'), 
                        'Must include Core Expertise section');
                    assert.ok(prompt.includes('## Development Methodology'), 
                        'Must include Development Methodology section');
                    assert.ok(prompt.includes('## Best Practices'), 
                        'Must include Best Practices section');
                    assert.ok(prompt.includes('## Deliverables'), 
                        'Must include Deliverables section');
                    assert.ok(prompt.includes('Part of NofX.dev team'), 
                        'Must include team reference');
                });

                it('should include domain-specific content', () => {
                    const prompt = generated.systemPrompt;
                    const domain = config.primaryDomain;
                    
                    // Contract: Must mention the domain
                    assert.ok(prompt.toLowerCase().includes(domain.toLowerCase()), 
                        `Must mention ${domain} domain`);
                    
                    // Contract: Must include specified languages
                    config.languages.forEach(lang => {
                        assert.ok(prompt.includes(lang), 
                            `Must include language: ${lang}`);
                    });
                    
                    // Contract: Must include specified frameworks
                    config.frameworks.forEach(framework => {
                        assert.ok(prompt.includes(framework), 
                            `Must include framework: ${framework}`);
                    });
                });

                it('should generate valid taskPreferences', () => {
                    const prefs = generated.taskPreferences;
                    
                    // Contract: Must have required preference properties
                    assert.ok(Array.isArray(prefs.preferred), 'preferred must be array');
                    assert.ok(Array.isArray(prefs.avoid), 'avoid must be array');
                    assert.ok(['high', 'medium', 'low'].includes(prefs.priority), 
                        'priority must be valid');
                    assert.ok(prefs.complexity, 'Must have complexity');
                    
                    // Contract: Preferences should be non-empty for valid configs
                    assert.ok(prefs.preferred.length > 0, 
                        'Should have preferred tasks');
                });

                it('should generate valid capabilities', () => {
                    const caps = generated.capabilities as any;
                    
                    // Contract: Must include language capabilities
                    assert.ok(caps.languages, 'Must have languages');
                    assert.ok(caps.languages.primary, 'Must have primary languages');
                    assert.ok(Array.isArray(caps.languages.primary), 
                        'Primary languages must be array');
                    
                    // Contract: Must include specified languages
                    config.languages.forEach(lang => {
                        assert.ok(caps.languages.primary.includes(lang) || 
                                 caps.languages.all?.includes(lang),
                            `Capabilities must include ${lang}`);
                    });
                });

                it('should generate consistent IDs', () => {
                    // Contract: ID should be deterministic based on domain
                    const expectedId = `${config.primaryDomain}-developer`;
                    assert.strictEqual(generated.id, expectedId, 
                        'ID should be domain-developer format');
                });

                it('should not include shell-breaking characters unescaped', () => {
                    const prompt = generated.systemPrompt;
                    
                    // Contract: Should not have unescaped backticks in commands
                    // (We removed them in our fix)
                    const commandMatch = prompt.match(/git status|git log|ls -la/);
                    if (commandMatch) {
                        const surroundingText = prompt.substring(
                            Math.max(0, commandMatch.index! - 1),
                            Math.min(prompt.length, commandMatch.index! + commandMatch[0].length + 1)
                        );
                        assert.ok(!surroundingText.includes('`'), 
                            'Commands should not be wrapped in backticks');
                    }
                });
            });
        });
    });

    describe('ArchitectSmartTemplate Contract', () => {
        const validConfig: ArchitectConfig = {
            category: 'architect',
            complexity: 'high',
            priority: 'high',
            scope: 'software',
            focusAreas: ['microservices', 'cloud-native'],
            decisionLevel: 'strategic',
            systemTypes: ['distributed', 'scalable']
        };

        it('should fulfill the base template contract', () => {
            const template = new ArchitectSmartTemplate(validConfig);
            const generated = template.generateTemplate();
            
            // Contract: Must have all required properties
            assert.ok(generated.id === 'software-architect');
            assert.ok(generated.name === 'Software Architect');
            assert.ok(generated.systemPrompt.includes('Architect'));
            assert.ok(generated.systemPrompt.includes('microservices'));
        });

        it('should generate architect-specific content', () => {
            const template = new ArchitectSmartTemplate(validConfig);
            const generated = template.generateTemplate();
            
            // Contract: Architect templates must mention architecture
            assert.ok(generated.systemPrompt.includes('system design'));
            assert.ok(generated.systemPrompt.includes('architectural patterns'));
            assert.ok(generated.capabilities);
        });
    });

    describe('QualitySmartTemplate Contract', () => {
        const validConfig: QualityConfig = {
            category: 'quality',
            complexity: 'high',
            priority: 'high',
            primaryFocus: 'testing',
            testingTypes: ['unit', 'integration', 'e2e'],
            securityScope: ['vulnerabilities', 'compliance'],
            auditAreas: ['code-quality', 'performance'],
            toolchain: ['jest', 'cypress']
        };

        it('should fulfill the base template contract', () => {
            const template = new QualitySmartTemplate(validConfig);
            const generated = template.generateTemplate();
            
            // Contract: Must have all required properties
            assert.ok(generated.id === 'testing-quality');
            assert.ok(generated.name === 'Testing Quality Specialist');
            assert.ok(generated.systemPrompt);
            
            // Contract: Must mention testing focus
            assert.ok(generated.systemPrompt.includes('testing') || 
                     generated.systemPrompt.includes('Testing'));
        });

        it('should include testing types in capabilities', () => {
            const template = new QualitySmartTemplate(validConfig);
            const generated = template.generateTemplate();
            const caps = generated.capabilities as any;
            
            // Contract: Must include specified testing types
            assert.ok(caps.testingTypes);
            validConfig.testingTypes.forEach(type => {
                assert.ok(caps.testingTypes.includes(type), 
                    `Must include testing type: ${type}`);
            });
        });
    });

    describe('Cross-Template Contracts', () => {
        it('all templates should generate valid JSON-serializable objects', () => {
            const configs = [
                {
                    template: DeveloperSmartTemplate,
                    config: {
                        category: 'developer',
                        complexity: 'high',
                        priority: 'high',
                        primaryDomain: 'frontend',
                        languages: ['typescript'],
                        frameworks: ['react'],
                        specializations: ['ui'],
                        toolchain: ['webpack']
                    } as DeveloperConfig
                },
                {
                    template: ArchitectSmartTemplate,
                    config: {
                        category: 'architect',
                        complexity: 'high',
                        priority: 'high',
                        scope: 'cloud',
                        focusAreas: ['aws'],
                        decisionLevel: 'tactical',
                        systemTypes: ['serverless']
                    } as ArchitectConfig
                }
            ];

            configs.forEach(({ template: TemplateClass, config }) => {
                const instance = new TemplateClass(config as any);
                const generated = instance.generateTemplate();
                
                // Contract: Must be JSON serializable
                const jsonString = JSON.stringify(generated);
                const parsed = JSON.parse(jsonString);
                
                assert.ok(parsed.id === generated.id, 
                    'Should survive JSON serialization');
                assert.ok(parsed.systemPrompt === generated.systemPrompt, 
                    'Prompt should survive JSON serialization');
            });
        });

        it('all templates should handle edge cases gracefully', () => {
            // Empty arrays config
            const minimalConfig: DeveloperConfig = {
                category: 'developer',
                complexity: 'low',
                priority: 'low',
                primaryDomain: 'frontend',
                languages: [],
                frameworks: [],
                specializations: [],
                toolchain: []
            };

            const template = new DeveloperSmartTemplate(minimalConfig);
            const generated = template.generateTemplate();
            
            // Contract: Should still generate valid template
            assert.ok(generated.id);
            assert.ok(generated.systemPrompt);
            assert.ok(generated.systemPrompt.length > 1000, 
                'Should still generate substantial prompt');
        });

        it('all prompts should be safe for shell execution', () => {
            const testConfigs = [
                {
                    category: 'developer',
                    complexity: 'high',
                    priority: 'high',
                    primaryDomain: 'fullstack',
                    languages: ["java'script", 'type"script'],  // Dangerous names
                    frameworks: ['re`act', 'vue$js'],  // Shell metacharacters
                    specializations: ['ui;ux', 'api&design'],  // Command separators
                    toolchain: ['web|pack', 'docker>compose']  // Redirects
                } as DeveloperConfig
            ];

            testConfigs.forEach(config => {
                const template = new DeveloperSmartTemplate(config);
                const generated = template.generateTemplate();
                
                // Contract: Prompt should not break shell when escaped properly
                const escaped = generated.systemPrompt
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/\$/g, '\\$')
                    .replace(/`/g, '\\`');
                
                // Should not have unescaped dangerous characters
                assert.ok(!escaped.match(/[^\\]["'`$]/), 
                    'Dangerous characters should be escaped');
            });
        });
    });

    describe('Performance Contracts', () => {
        it('should generate templates quickly', () => {
            const config: DeveloperConfig = {
                category: 'developer',
                complexity: 'high',
                priority: 'high',
                primaryDomain: 'frontend',
                languages: ['typescript', 'javascript', 'html', 'css'],
                frameworks: ['react', 'next.js', 'tailwind'],
                specializations: ['performance', 'accessibility', 'seo'],
                toolchain: ['webpack', 'babel', 'eslint', 'prettier']
            };

            const start = Date.now();
            const template = new DeveloperSmartTemplate(config);
            const generated = template.generateTemplate();
            const duration = Date.now() - start;
            
            // Contract: Template generation should be fast
            assert.ok(duration < 100, 
                `Template generation should be <100ms, took ${duration}ms`);
        });

        it('should handle 100 template generations without memory issues', () => {
            const config: DeveloperConfig = {
                category: 'developer',
                complexity: 'high',
                priority: 'high',
                primaryDomain: 'backend',
                languages: ['python'],
                frameworks: ['django'],
                specializations: ['api'],
                toolchain: ['docker']
            };

            const templates: SmartAgentTemplate[] = [];
            
            for (let i = 0; i < 100; i++) {
                const template = new DeveloperSmartTemplate(config);
                templates.push(template.generateTemplate());
            }
            
            // Contract: All templates should be valid
            assert.strictEqual(templates.length, 100);
            templates.forEach(t => {
                assert.ok(t.systemPrompt.length > 3000);
                assert.ok(t.systemPrompt.length < 4096);
            });
        });
    });
});