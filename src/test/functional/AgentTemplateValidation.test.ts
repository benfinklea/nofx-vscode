/**
 * Agent Template Validation Tests
 *
 * These tests validate the most critical part of NofX: the agent templates.
 * Agent templates define the behavior, capabilities, and prompts for all agents.
 * If these are broken, the entire system fails.
 *
 * These tests catch real bugs that would break the user experience.
 */

import * as path from 'path';
import * as fs from 'fs';
import {
    createMockConfigurationService,
    createMockLoggingService,
    createMockEventBus,
    createMockNotificationService,
    createMockContainer,
    createMockExtensionContext,
    createMockOutputChannel,
    createMockTerminal,
    setupVSCodeMocks
} from './../helpers/mockFactories';

// Define the expected structure of agent templates
interface AgentTemplate {
    id: string;
    name: string;
    icon?: string;
    terminalIcon?: string;
    color?: string;
    description?: string;
    version?: string;
    types?: string[];
    tags?: string[];
    capabilities?: {
        languages?: string[];
        frameworks?: Record<string, string[]>;
        methodologies?: string[];
        tools?: string[];
        specialties?: string[];
    };
    systemPrompt: string;
    detailedPrompt?: string;
    taskPreferences?: {
        preferred?: string[];
        avoid?: string[];
        priority?: string;
        approach?: string;
    };
    filePatterns?: {
        watch?: string[];
        ignore?: string[];
        config?: string[];
    };
    commands?: Record<string, string>;
    codeSnippets?: Record<string, string>;
    qualityGates?: Record<string, any>;
}

describe('Agent Template Validation', () => {
    const templatesDir = path.join(__dirname, '../../../src/agents/templates');
    let templateFiles: string[];
    let templates: { filename: string; template: AgentTemplate }[];

    beforeAll(() => {
        console.log('Looking for templates in:', templatesDir);

        // Load all template files
        if (!fs.existsSync(templatesDir)) {
            console.log('Templates directory does not exist');
            console.log('Current directory:', process.cwd());
            console.log('__dirname:', __dirname);
            throw new Error(`Templates directory not found: ${templatesDir}`);
        }

        const allFiles = fs.readdirSync(templatesDir);
        console.log('Files in templates directory:', allFiles);

        templateFiles = allFiles.filter(file => file.endsWith('.json')).sort();

        console.log('JSON template files found:', templateFiles);

        if (templateFiles.length === 0) {
            throw new Error('No template files found');
        }

        // Parse all templates
        templates = templateFiles.map(filename => {
            const filePath = path.join(templatesDir, filename);
            console.log('Loading template:', filePath);
            const content = fs.readFileSync(filePath, 'utf8');

            let template: AgentTemplate;
            try {
                template = JSON.parse(content);
            } catch (error) {
                throw new Error(`Failed to parse ${filename}: ${error}`);
            }

            return { filename, template };
        });

        console.log(`Loaded ${templates.length} templates successfully`);
    });

    describe('Template File Structure', () => {
        it('should have template files', () => {
            expect(templateFiles.length).toBeGreaterThan(0);
            console.log(
                `Found ${templateFiles.length} template files:`,
                templateFiles.map(f => f.replace('.json', ''))
            );
        });

        it('should parse all templates as valid JSON', () => {
            templates.forEach(({ filename, template }) => {
                expect(template).toBeDefined();
                expect(typeof template).toBe('object');
            });
        });

        it('should have expected templates for core agent types', () => {
            const expectedTemplates = [
                'testing-specialist',
                'frontend-specialist',
                'backend-specialist',
                'fullstack-developer'
            ];

            expectedTemplates.forEach(expectedId => {
                const found = templates.some(({ template }) => template.id === expectedId);
                expect(found).toBe(true);
            });
        });
    });

    describe('Required Template Fields', () => {
        it('should validate all templates have required fields', () => {
            expect(templates).toBeDefined();
            expect(templates.length).toBeGreaterThan(0);

            templates.forEach(({ filename, template }) => {
                // ID validation
                expect(template.id).toBeTruthy();
                expect(typeof template.id).toBe('string');
                expect(template.id.length).toBeGreaterThan(0);

                // ID should match filename (without .json)
                const expectedId = filename.replace('.json', '');
                expect(template.id).toBe(expectedId);

                // Name validation
                expect(template.name).toBeTruthy();
                expect(typeof template.name).toBe('string');
                expect(template.name.length).toBeGreaterThan(0);
                expect(template.name.trim()).toBe(template.name); // No leading/trailing spaces

                // System prompt validation
                expect(template.systemPrompt).toBeTruthy();
                expect(typeof template.systemPrompt).toBe('string');
                expect(template.systemPrompt.length).toBeGreaterThan(50); // Should be substantial
                expect(template.systemPrompt.trim()).toBe(template.systemPrompt); // No leading/trailing spaces

                // Optional fields validation
                if (template.description) {
                    expect(typeof template.description).toBe('string');
                    expect(template.description.length).toBeGreaterThan(0);
                }

                if (template.version) {
                    expect(typeof template.version).toBe('string');
                    expect(template.version).toMatch(/^\d+\.\d+\.\d+$/); // Semver format
                }

                if (template.icon) {
                    expect(typeof template.icon).toBe('string');
                    expect(template.icon.length).toBeGreaterThan(0);
                }

                if (template.color) {
                    expect(typeof template.color).toBe('string');
                    expect(template.color).toMatch(/^#[0-9A-Fa-f]{6}$/); // Hex color
                }
            });
        });
    });

    describe('Template Content Quality', () => {
        templates.forEach(({ filename, template }) => {
            describe(`${filename}`, () => {
                it('should have meaningful systemPrompt content', () => {
                    const prompt = template.systemPrompt.toLowerCase();

                    // Should mention the role/specialty
                    const roleName = template.name.toLowerCase();
                    const hasRoleReference =
                        prompt.includes(roleName) ||
                        prompt.includes(template.id.replace('-', ' ')) ||
                        prompt.includes('specialist') ||
                        prompt.includes('expert') ||
                        prompt.includes('developer');

                    expect(hasRoleReference).toBe(true);
                });

                it('should have capabilities that match the role', () => {
                    if (!template.capabilities) return;

                    const roleId = template.id;
                    const capabilities = template.capabilities;

                    if (roleId.includes('testing')) {
                        expect(
                            capabilities.frameworks?.unit ||
                                capabilities.frameworks?.e2e ||
                                capabilities.tools?.some(
                                    tool => tool.includes('test') || tool.includes('jest') || tool.includes('cypress')
                                )
                        ).toBeTruthy();
                    }

                    if (roleId.includes('frontend')) {
                        expect(
                            capabilities.languages?.includes('javascript') ||
                                capabilities.languages?.includes('typescript') ||
                                capabilities.frameworks?.frontend ||
                                capabilities.tools?.some(
                                    tool => tool.includes('react') || tool.includes('vue') || tool.includes('angular')
                                )
                        ).toBeTruthy();
                    }

                    if (roleId.includes('backend')) {
                        expect(
                            capabilities.languages?.some(lang =>
                                ['javascript', 'typescript', 'python', 'java', 'go', 'rust'].includes(lang)
                            ) ||
                                capabilities.frameworks?.backend ||
                                capabilities.specialties?.some(
                                    spec => spec.includes('api') || spec.includes('database') || spec.includes('server')
                                )
                        ).toBeTruthy();
                    }
                });

                it('should have task preferences that make sense', () => {
                    if (!template.taskPreferences) return;

                    const prefs = template.taskPreferences;
                    const roleId = template.id;

                    // Preferred tasks should align with role
                    if (prefs.preferred) {
                        expect(Array.isArray(prefs.preferred)).toBe(true);
                        expect(prefs.preferred.length).toBeGreaterThan(0);

                        if (roleId.includes('testing')) {
                            expect(
                                prefs.preferred.some(
                                    pref => pref.includes('test') || pref.includes('qa') || pref.includes('coverage')
                                )
                            ).toBe(true);
                        }
                    }

                    // Should avoid tasks outside their specialty
                    if (prefs.avoid) {
                        expect(Array.isArray(prefs.avoid)).toBe(true);
                    }

                    // Priority should be valid
                    if (prefs.priority) {
                        expect(['low', 'medium', 'high', 'critical']).toContain(prefs.priority);
                    }

                    // Approach should be valid
                    if (prefs.approach) {
                        expect(typeof prefs.approach).toBe('string');
                        expect(prefs.approach.length).toBeGreaterThan(0);
                    }
                });

                it('should have valid file patterns when specified', () => {
                    if (!template.filePatterns) return;

                    const patterns = template.filePatterns;

                    if (patterns.watch) {
                        expect(Array.isArray(patterns.watch)).toBe(true);
                        patterns.watch.forEach(pattern => {
                            expect(typeof pattern).toBe('string');
                            expect(pattern.length).toBeGreaterThan(0);
                        });
                    }

                    if (patterns.ignore) {
                        expect(Array.isArray(patterns.ignore)).toBe(true);
                        patterns.ignore.forEach(pattern => {
                            expect(typeof pattern).toBe('string');
                            expect(pattern.length).toBeGreaterThan(0);
                        });
                    }

                    if (patterns.config) {
                        expect(Array.isArray(patterns.config)).toBe(true);
                        patterns.config.forEach(pattern => {
                            expect(typeof pattern).toBe('string');
                            expect(pattern.length).toBeGreaterThan(0);
                        });
                    }
                });
            });
        });
    });

    describe('Template Consistency', () => {
        it('should have unique IDs across all templates', () => {
            const ids = templates.map(({ template }) => template.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });

        it('should have unique names across all templates', () => {
            const names = templates.map(({ template }) => template.name);
            const uniqueNames = new Set(names);
            expect(uniqueNames.size).toBe(names.length);
        });

        it('should follow consistent naming patterns', () => {
            templates.forEach(({ template }) => {
                // ID should be kebab-case
                expect(template.id).toMatch(/^[a-z]([a-z0-9-]*[a-z0-9])?$/);

                // Name should be Title Case
                expect(template.name).toMatch(/^[A-Z]/);
            });
        });

        it('should have consistent structure across templates', () => {
            // All templates should have the same basic shape
            const requiredFields = ['id', 'name', 'systemPrompt'];
            const commonOptionalFields = ['description', 'capabilities', 'taskPreferences'];

            templates.forEach(({ filename, template }) => {
                requiredFields.forEach(field => {
                    expect(template).toHaveProperty(field);
                });

                // Check that optional fields, when present, have consistent types
                commonOptionalFields.forEach(field => {
                    if (template.hasOwnProperty(field)) {
                        expect(template[field as keyof AgentTemplate]).toBeDefined();
                    }
                });
            });
        });
    });

    describe('Template Completeness for Testing Specialist', () => {
        const testingTemplate = templates.find(({ template }) => template.id === 'testing-specialist');

        if (testingTemplate) {
            it('should have comprehensive testing capabilities', () => {
                const template = testingTemplate.template;

                expect(template.capabilities).toBeDefined();
                expect(template.capabilities!.frameworks).toBeDefined();

                const frameworks = template.capabilities!.frameworks!;

                // Should have unit testing frameworks
                expect(frameworks.unit).toBeDefined();
                expect(Array.isArray(frameworks.unit)).toBe(true);
                expect(frameworks.unit.length).toBeGreaterThan(0);
                expect(frameworks.unit).toContain('jest');

                // Should have e2e testing frameworks
                expect(frameworks.e2e).toBeDefined();
                expect(Array.isArray(frameworks.e2e)).toBe(true);
                expect(frameworks.e2e.length).toBeGreaterThan(0);
                expect(frameworks.e2e).toContain('playwright');

                // Should mention testing methodologies
                expect(template.capabilities!.methodologies).toBeDefined();
                expect(template.capabilities!.methodologies).toContain('tdd');
            });

            it('should have testing-specific task preferences', () => {
                const template = testingTemplate.template;

                expect(template.taskPreferences).toBeDefined();
                expect(template.taskPreferences!.preferred).toBeDefined();

                const preferred = template.taskPreferences!.preferred!;
                expect(preferred).toContain('test-implementation');
                expect(preferred).toContain('coverage-improvement');
            });

            it('should have quality gates defined', () => {
                const template = testingTemplate.template;

                expect(template.qualityGates).toBeDefined();
                expect(template.qualityGates!.coverage).toBeDefined();

                const coverage = template.qualityGates!.coverage;
                expect(coverage.lines).toBeGreaterThan(0);
                expect(coverage.branches).toBeGreaterThan(0);
            });
        }
    });

    describe('System Prompt Quality', () => {
        templates.forEach(({ filename, template }) => {
            describe(`${filename}`, () => {
                it('should have actionable system prompt', () => {
                    const prompt = template.systemPrompt.toLowerCase();

                    // Should contain action words
                    const actionWords = [
                        'implement',
                        'create',
                        'develop',
                        'test',
                        'analyze',
                        'review',
                        'design',
                        'build'
                    ];
                    const hasActionWords = actionWords.some(word => prompt.includes(word));
                    expect(hasActionWords).toBe(true);
                });

                it('should not contain placeholder text', () => {
                    const prompt = template.systemPrompt.toLowerCase();
                    const placeholders = ['todo', 'tbd', 'placeholder', 'lorem ipsum', '{{', '}}', '[insert', '[todo'];

                    placeholders.forEach(placeholder => {
                        expect(prompt).not.toContain(placeholder);
                    });
                });

                it('should be professional and clear', () => {
                    const prompt = template.systemPrompt;

                    // Should not be too short
                    expect(prompt.length).toBeGreaterThan(100);

                    // Should not contain informal language
                    const informalWords = ['gonna', 'wanna', 'kinda', 'sorta', 'lol', 'omg'];
                    const lowerPrompt = prompt.toLowerCase();
                    informalWords.forEach(word => {
                        expect(lowerPrompt).not.toContain(word);
                    });
                });
            });
        });
    });

    describe('Real-World Usage Validation', () => {
        it('should have templates that cover common development tasks', () => {
            const templateIds = templates.map(({ template }) => template.id);

            // Should cover major development areas
            const areas = ['frontend', 'backend', 'testing', 'fullstack'];
            areas.forEach(area => {
                const hasAreaTemplate = templateIds.some(
                    id =>
                        id.includes(area) ||
                        templates.some(
                            ({ template }) =>
                                template.name.toLowerCase().includes(area) ||
                                template.systemPrompt.toLowerCase().includes(area)
                        )
                );
                expect(hasAreaTemplate).toBe(true);
            });
        });

        it('should have templates with modern technology stacks', () => {
            const allCapabilities = templates.flatMap(({ template }) => [
                ...(template.capabilities?.languages || []),
                ...(template.capabilities?.tools || []),
                ...Object.values(template.capabilities?.frameworks || {}).flat()
            ]);

            // Should include modern technologies
            const modernTech = ['typescript', 'javascript', 'react', 'jest', 'playwright'];
            modernTech.forEach(tech => {
                const hasTech = allCapabilities.some(cap => cap.toLowerCase().includes(tech.toLowerCase()));
                expect(hasTech).toBe(true);
            });
        });
    });
});
